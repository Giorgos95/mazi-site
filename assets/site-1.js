// The script every page loads: the day/night switch, the gentle rise-in of
// sections, and the í on pages that have one. The colours themselves were
// already picked by the inline script in each page's <head>, before the
// first paint; this keeps them in step afterwards.
//
// Like the stylesheet, the name carries a number: a change that must reach
// every visitor at once goes in a new file, site-2.js.

const root = document.documentElement;
const KEY = 'mazi-theme';
// The colour of the browser's own bar, so it matches the page.
const BAR = { day: '#FFF7EC', night: '#141E33' };

// localStorage throws in Safari with storage blocked and in some private
// modes. The switch then still works on the page; it just isn't remembered.
function storedTheme() {
  try {
    const theme = localStorage.getItem(KEY);
    return theme === 'day' || theme === 'night' ? theme : null;
  } catch {
    return null;
  }
}
function storeTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* not remembered, see above */ }
}

export function setupThemeSwitch() {
  const button = document.getElementById('theme-switch');
  const system = matchMedia('(prefers-color-scheme: dark)');
  // Whether the visitor used the switch on this page, for when storage fails.
  let picked = false;

  const show = (theme) => {
    root.dataset.theme = theme;
    button?.setAttribute('aria-pressed', String(theme === 'night'));
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = BAR[theme];
  };
  // Other scripts (the homepage's í) react to the change.
  const change = (theme, byUser) => {
    show(theme);
    document.dispatchEvent(new CustomEvent('mazi:theme', { detail: { theme, byUser } }));
  };

  show(root.dataset.theme === 'night' ? 'night' : 'day');

  button?.addEventListener('click', () => {
    const theme = root.dataset.theme === 'night' ? 'day' : 'night';
    picked = true;
    storeTheme(theme);
    change(theme, true);
  });

  // Until the visitor picks, the page follows the system, also when it
  // changes while the page is open (a phone going dark at sunset).
  system.addEventListener('change', () => {
    if (picked || storedTheme()) return;
    change(system.matches ? 'night' : 'day', false);
  });
}

export function setupReveal() {
  // Reduced motion means everything is simply there.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Only what starts below the fold waits to rise in. Anything already on
  // screen stays put, so nothing the visitor is reading disappears.
  const later = [...document.querySelectorAll('.reveal')]
    .filter((el) => el.getBoundingClientRect().top >= innerHeight);
  if (!later.length) return;
  // Threshold 0, not a share of the element, so even a section taller than
  // the screen rises in. The margin starts it once it is a little way in.
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.remove('pending');
      watcher.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  for (const el of later) {
    el.classList.add('pending');
    watcher.observe(el);
  }
}

setupThemeSwitch();
setupReveal();
// The í is drawn only where a page has one, so other pages never load it.
if (document.querySelector('[data-i-pose]')) import('./mascot-1.js').then((m) => m.drawAll());
