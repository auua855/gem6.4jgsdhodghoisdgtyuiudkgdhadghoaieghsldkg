const CACHE_NAME = 'gemini-window-v1';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/state.js',
  './js/ui.js',
  './js/api.js',
  './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
