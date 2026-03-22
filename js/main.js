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
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    try {
      if (
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
      )
        return;
    } catch (e) {}
    var url = new URL('service-worker.js', window.location.href);
    navigator.serviceWorker.register(url.href, { scope: './' }).catch(function () {});

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  };

  function init() {
    app.attachWebManifest();
    app.loadState();
    if (app.musicSeedDefaultBundledTracks) app.musicSeedDefaultBundledTracks();
    if (app.initMusic) app.initMusic();
    app.bindClicks();
    if (app.updateResetButtonVisibility) app.updateResetButtonVisibility();
    app.registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.MafiaApp);
