// BUILD:PRECACHE-BEGIN (автогенерация scripts/build-sw.cjs — не редактировать руками)
var CACHE_NAME = 'mafia-host-static-52a7f71fa31a';
var ASSETS = [
  './',
  './audio/1.mp3',
  './audio/10.mp3',
  './audio/2.mp3',
  './audio/3.mp3',
  './audio/30-seconds-free-sit.mp3',
  './audio/4.mp3',
  './audio/5.mp3',
  './audio/6.mp3',
  './audio/7.mp3',
  './audio/8.mp3',
  './audio/9.mp3',
  './audio/don-leaves.mp3',
  './audio/don-wakes.mp3',
  './audio/first-killed-best-predicition.mp3',
  './audio/mafia-10-seconds-acquaintance.mp3',
  './audio/mafia-leaves-acquaintance.mp3',
  './audio/mafia-leaves.mp3',
  './audio/mafia-shoots-with-a-number.mp3',
  './audio/mafia-wakes-acquaintance.mp3',
  './audio/morning-last-speech.mp3',
  './audio/morning-miss.mp3',
  './audio/morning.mp3',
  './audio/sheriff-leaves.mp3',
  './audio/sheriff-wakes.mp3',
  './audio/thank-you-stop.mp3',
  './audio/track1.mp3',
  './audio/track2.mp3',
  './audio/you-have-10-seconds.mp3',
  './css/styles.css',
  './css/tailwind.css',
  './icons/github.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.png',
  './icons/mafiauniverse.png',
  './icons/telegram.svg',
  './index.html',
  './js/audio/music-control.js',
  './js/audio/music-player.js',
  './js/audio/music-preview.js',
  './js/audio/music-settings-html.js',
  './js/audio/music-settings.js',
  './js/audio/music-store.js',
  './js/audio/music-volume.js',
  './js/audio/music-zip.js',
  './js/audio/spotify-auth.js',
  './js/audio/spotify-player.js',
  './js/audio/spotify-store.js',
  './js/audio/voice.js',
  './js/core/dispatch.js',
  './js/core/screens.js',
  './js/core/state.js',
  './js/core/utils.js',
  './js/events/auto/day.js',
  './js/events/auto/flow.js',
  './js/events/auto/intro.js',
  './js/events/auto/merlin-guess.js',
  './js/events/auto/night.js',
  './js/events/auto/player.js',
  './js/events/auto/vote.js',
  './js/events/host/player.js',
  './js/events/host/side.js',
  './js/events/host/timer.js',
  './js/events/host/tools.js',
  './js/events/host/vote.js',
  './js/events/menu.js',
  './js/events/music.js',
  './js/events/prepare.js',
  './js/events/summary.js',
  './js/events/voice.js',
  './js/game/donskaya.js',
  './js/game/kasper.js',
  './js/game/merlin.js',
  './js/game/standard.js',
  './js/game/variants.js',
  './js/game/vote-rules.js',
  './js/main.js',
  './js/modes/auto/core.js',
  './js/modes/auto/day.js',
  './js/modes/auto/endgame.js',
  './js/modes/auto/gestures.js',
  './js/modes/auto/intro.js',
  './js/modes/auto/last-words.js',
  './js/modes/auto/migration.js',
  './js/modes/auto/mode.js',
  './js/modes/auto/night.js',
  './js/modes/auto/reveal.js',
  './js/modes/auto/setup.js',
  './js/modes/auto/vote.js',
  './js/modes/host/cards.js',
  './js/modes/host/player-modal.js',
  './js/modes/host/players.js',
  './js/modes/host/prepare-players.js',
  './js/modes/host/side.js',
  './js/modes/host/timer.js',
  './js/modes/host/tools.js',
  './js/modes/host/voting.js',
  './js/mu-autocomplete.js',
  './js/mu-bridge.js',
  './js/mu-state-apply.js',
  './js/mu-utils.js',
  './js/mu-vote-reconstruct.js',
  './js/summary/export.js',
  './js/summary/log.js',
  './js/summary/modals.js',
  './js/summary/mu-export.js',
  './js/summary/player-data.js',
  './js/summary/summary.js',
  './js/ui/desktop-player-panel.js',
  './js/ui/desktop-setup-slot.js',
  './js/ui/desktop-shell.js',
  './js/ui/desktop-vote-count.js',
  './js/ui/prepare-screen.js',
  './js/vendor/jszip.min.js',
  './js/vendor/niokit/components.css',
  './js/vendor/niokit/niokit.js',
  './js/vendor/niokit/tokens.css',
  './manifest.webmanifest',
];
// BUILD:PRECACHE-END

self.addEventListener('install', function (e) {
  // Ядро приложения кэшируем строго (без него офлайн не работает),
  // аудио — best-effort: один сорвавшийся трек не должен ломать установку SW.
  var core = ASSETS.filter(function (a) {
    return a.indexOf('./audio/') !== 0;
  });
  var media = ASSETS.filter(function (a) {
    return a.indexOf('./audio/') === 0;
  });
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(core).then(function () {
          return Promise.all(
            media.map(function (a) {
              return cache.add(a).catch(function () {});
            })
          );
        });
      })
      .then(function () {
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

self.addEventListener('message', function (e) {
  var data = e && e.data ? e.data : null;
  if (!data || data.type !== 'prefetch-default-tracks') return;
  var tracks = Array.isArray(data.tracks) ? data.tracks : [];
  if (!tracks.length) return;
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      var reqs = [];
      for (var i = 0; i < tracks.length; i++) {
        try {
          var abs = new URL(tracks[i], self.location.href).href;
          reqs.push(new Request(abs, { credentials: 'same-origin' }));
        } catch (err) {}
      }
      if (!reqs.length) return;
      return cache.addAll(reqs);
    }).catch(function () {})
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
    return h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com';
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
