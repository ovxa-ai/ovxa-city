// OVXA City entry. `/?classic` keeps the original illustrated Grok Bot island; everything else is the universal city.
const q = new URLSearchParams(location.search);
if (q.has('classic')) {
  import('./style.css'); import('./classic').then((m) => m.start());
} else {
  import('./metro').then((m) => m.start());
}
