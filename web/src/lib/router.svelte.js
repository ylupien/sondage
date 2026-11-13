// Mini-routeur : chemin courant réactif, navigation sans rechargement.
export const route = $state({ path: location.pathname.replace(/\/+$/, '') || '/' });

// Garde facultative (ex. modifications non enregistrées) : renvoie false pour annuler.
let guard = null;
export const setGuard = (fn) => (guard = fn);

export function navigate(url, { replace = false } = {}) {
  if (guard && guard() === false) return;
  guard = null;
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  route.path = location.pathname.replace(/\/+$/, '') || '/';
  window.scrollTo(0, 0);
}

// Pour les liens internes : <a href="/admin" onclick={link}>
export function link(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(e.currentTarget.getAttribute('href'));
}

window.addEventListener('popstate', () => {
  route.path = location.pathname.replace(/\/+$/, '') || '/';
});
