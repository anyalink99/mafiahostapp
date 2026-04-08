(function (app) {
  app.attachWebManifest = function () {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = new URL('manifest.webmanifest', location.href).href;
    document.head.appendChild(link);
  };

  app.registerServiceWorker = function () {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (location.protocol === 'file:') return Promise.resolve(null);
    try {
      if (
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
      )
        return Promise.resolve(null);
    } catch (e) {}
    var url = new URL('service-worker.js', window.location.href);
    var regPromise = navigator.serviceWorker.register(url.href, { scope: './' }).catch(function () {
      return null;
    });

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    return regPromise;
  };

  app.prefetchDefaultTracks = function () {
    if (location.protocol === 'file:') return;
    var tracks = app.musicGetDefaultBundledTrackPaths ? app.musicGetDefaultBundledTrackPaths() : [];
    if (!tracks.length) return;

    function warmViaPageFetch() {
      for (var i = 0; i < tracks.length; i++) {
        try {
          var abs = new URL(tracks[i], window.location.href).href;
          fetch(abs, { credentials: 'same-origin' }).catch(function () {});
        } catch (e) {}
      }
    }

    if (!('serviceWorker' in navigator)) {
      warmViaPageFetch();
      return;
    }

    navigator.serviceWorker.ready
      .then(function (reg) {
        var target = reg && (reg.active || reg.waiting || reg.installing);
        if (target) {
          try {
            target.postMessage({ type: 'prefetch-default-tracks', tracks: tracks.slice() });
          } catch (e) {}
        }
      })
      .catch(function () {})
      .then(function () {
        warmViaPageFetch();
      });
  };

  function init() {
    if (app.spotifyHandleCallback) app.spotifyHandleCallback();
    app.attachWebManifest();
    app.loadState();
    if (app.spotifyLoadClientId) app.spotifyLoadClientId();
    if (app.loadTimerVoicePref) app.loadTimerVoicePref();
    if (app.musicSeedDefaultBundledTracks) app.musicSeedDefaultBundledTracks();
    if (app.initMusic) app.initMusic();
    app.bindUiEvents();
    if (app.updateResetButtonVisibility) app.updateResetButtonVisibility();
    app.registerServiceWorker();
    if (app.prefetchDefaultTracks) app.prefetchDefaultTracks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.MafiaApp);
