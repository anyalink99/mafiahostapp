// При каждом коммите увеличивайте суффикс CACHE_NAME (v4 → v5 …),
// иначе клиенты могут долго получать старую статику из кэша.
var CACHE_NAME = 'mafia-host-static-v10';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/state.js',
  './js/music-storage.js',
  './js/music.js',
  './js/screens.js',
  './js/cards.js',
  './js/game.js',
  './js/summary.js',
  './js/events.js',
  './js/main.js',
  './js/tailwind.config.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './audio/you-have-10-seconds.mp3',
  './audio/thank-you-stop.mp3',
  './audio/mafia-10-seconds.mp3',
  './audio/mafia-leaves.mp3',
  './audio/track1.mp3',
  './audio/track2.mp3',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (err) {
    return false;
  }
}

function shouldNetworkFirst(req) {
  if (!isSameOrigin(req.url)) return false;
  if (req.mode === 'navigate') return true;
  var path = new URL(req.url).pathname;
  if (/\.(html|js|css)(\?.*)?$/i.test(path)) return true;
  return false;
}

function isCacheableRemoteAsset(req) {
  if (req.method !== 'GET') return false;
  try {
    var h = new URL(req.url).hostname;
    return (
      h === 'cdn.tailwindcss.com' ||
      h === 'fonts.googleapis.com' ||
      h === 'fonts.gstatic.com'
    );
  } catch (err) {
    return false;
  }
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  if (isCacheableRemoteAsset(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then(function (response) {
          if (
            response &&
            response.ok &&
            (response.type === 'basic' || response.type === 'cors')
          ) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(e.request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(e.request);
        })
    );
    return;
  }

  if (!isSameOrigin(e.request.url)) {
    return;
  }

  if (shouldNetworkFirst(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then(function (response) {
          if (response && response.ok && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(e.request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(e.request).then(function (cached) {
            if (cached) return cached;
            return caches.match('./index.html');
          });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).catch(function () {
        return caches.match(e.request).then(function (again) {
          if (again) return again;
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      });
    })
  );
});
