/* Offline shell.
   HTML is network-first so a redeploy reaches players on their next load;
   static assets are stale-while-revalidate so the game starts instantly and
   picks up new files in the background. Bump VERSION on every release. */
var VERSION = 'v1.6.0';
var CACHE = 'fabshop-' + VERSION;
var SHELL = [
  './',
  './index.html',
  './privacy.html',
  './support.html',
  './css/style.css',
  './js/data.js',
  './js/game.js',
  './js/feel.js',
  './js/ui.js',
  './js/coach.js',
  './js/store.js',
  './js/main.js',
  './js/native.js',
  './icon.svg',
  './icon-512.png',
  './manifest.json'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function isHtml(request) {
  return request.mode === 'navigate' ||
    (request.headers.get('accept') || '').indexOf('text/html') !== -1;
}

self.addEventListener('fetch', function (ev) {
  var request = ev.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (isHtml(request)) {
    ev.respondWith(
      fetch(request)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(request, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(request).then(function (hit) {
            return hit || caches.match('./index.html');
          });
        })
    );
    return;
  }

  ev.respondWith(
    caches.match(request).then(function (hit) {
      var live = fetch(request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || live;
    })
  );
});
