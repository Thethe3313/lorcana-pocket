// Service worker : appli installable et jouable hors connexion.
// Fichiers du jeu : « réseau d'abord » (toujours la dernière version, la copie en cache sert sans connexion).
// Les visuels des cartes viennent du site de Ravensburger et ne sont pas mis en cache ici :
// hors connexion, le jeu affiche à la place un cadre de carte généré.
const CACHE = 'lorcana-pocket';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || (url.origin !== location.origin && url.hostname !== 'fonts.googleapis.com' && url.hostname !== 'fonts.gstatic.com')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
