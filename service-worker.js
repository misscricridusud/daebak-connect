const CACHE_NAME = 'daebak-connect-v1';
const STATIC_CACHE = 'daebak-static-v1';
const DYNAMIC_CACHE = 'daebak-dynamic-v1';

// Fichiers à mettre en cache immédiatement à l'installation
const STATIC_ASSETS = [
  './',
  './index.html',
  './favicon.png',
  './favicon.ico',
  './apple-touch-icon.png',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// ── INSTALLATION ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Mise en cache des ressources statiques');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => {
      console.warn('[SW] Erreur de mise en cache:', err);
    })
  );
  self.skipWaiting();
});

// ── ACTIVATION ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// ── FETCH - Stratégie Network First avec fallback Cache ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes Supabase et API externes (toujours réseau)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('ko-fi.com') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // Pour les ressources statiques locales → Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback vers index.html si offline
          if (request.destination === 'document') {
            return caches.match('./index.html') || caches.match('./');
          }
        });
      })
    );
    return;
  }

  // Pour les ressources externes (CDN) → Cache First
  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => null);
      })
    );
    return;
  }

  // Network First pour tout le reste
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── MESSAGE : forcer la mise à jour ──
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
