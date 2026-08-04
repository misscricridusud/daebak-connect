const CACHE_NAME = 'daebak-connect-v3';
const STATIC_CACHE = 'daebak-static-v3';
const DYNAMIC_CACHE = 'daebak-dynamic-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './favicon.png',
  './favicon.ico',
  './apple-touch-icon.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Toujours réseau pour les APIs externes
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('ko-fi.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('googlesyndication.com') ||
    url.protocol === 'chrome-extension:' ||
    request.method !== 'GET'
  ) {
    return;
  }

  // Ressources locales → Network First (toujours fraîches)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // CDN → Cache First
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
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
