/**
 * PWA/platform shell:
 *   • подключает manifest только в обычном web-контексте;
 *   • регистрирует service worker и сообщает о готовом обновлении;
 *   • даёт явный install-поток Chromium и инструкцию для iOS/iPadOS;
 *   • показывает офлайн-состояние без вмешательства в игровую сессию.
 */
(function (app) {
  'use strict';

  var deferredInstallPrompt = null;
  var registration = null;
  var reloadForUpdate = false;
  var updateDismissed = false;
  var initialized = false;

  function isNativePlatform() {
    try {
      return !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
      );
    } catch (e) {
      return false;
    }
  }

  function isWebContext() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    if (isNativePlatform()) return false;
    if (app.MU && app.MU.isActive && app.MU.isActive()) return false;
    return true;
  }

  function isStandalone() {
    return !!(
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    );
  }

  function isAppleMobile() {
    var ua = navigator.userAgent || '';
    return (
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) &&
        typeof navigator.maxTouchPoints === 'number' &&
        navigator.maxTouchPoints > 1)
    );
  }

  function attachWebManifest() {
    if (!isWebContext()) return;
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = new URL('manifest.webmanifest', location.href).href;
    document.head.appendChild(link);
  }

  function syncInstallButton() {
    var button = document.getElementById('btn-pwa-install');
    var label = document.getElementById('btn-pwa-install-label');
    if (!button) return;
    var canPrompt = !!deferredInstallPrompt;
    var canExplainAppleInstall = isWebContext() && isAppleMobile() && !isStandalone();
    var visible = !isStandalone() && (canPrompt || canExplainAppleInstall);
    button.classList.toggle('hidden', !visible);
    if (label) {
      label.textContent = canPrompt ? 'Установить приложение' : 'Добавить на экран Домой';
    }
  }

  function showInstallHelp() {
    var modal = document.getElementById('modal-pwa-install');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, true);
  }

  function hideInstallHelp() {
    var modal = document.getElementById('modal-pwa-install');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
  }

  function install() {
    if (!deferredInstallPrompt) {
      if (isAppleMobile() && !isStandalone()) showInstallHelp();
      return Promise.resolve({ outcome: 'unavailable' });
    }

    var promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    syncInstallButton();
    try {
      promptEvent.prompt();
    } catch (e) {
      return Promise.resolve({ outcome: 'unavailable' });
    }
    return Promise.resolve(promptEvent.userChoice)
      .then(function (choice) {
        if (choice && choice.outcome === 'accepted' && app.showToast) {
          app.showToast('Приложение установлено');
        }
        return choice || { outcome: 'unknown' };
      })
      .catch(function () {
        return { outcome: 'unavailable' };
      });
  }

  function setUpdateBannerVisible(visible) {
    var banner = document.getElementById('pwa-update-banner');
    if (banner) banner.classList.toggle('hidden', !visible);
  }

  function signalWaitingUpdate(reg) {
    if (!reg || !reg.waiting || !navigator.serviceWorker.controller || updateDismissed) return;
    registration = reg;
    setUpdateBannerVisible(true);
  }

  function watchRegistration(reg) {
    registration = reg;
    signalWaitingUpdate(reg);
    reg.addEventListener('updatefound', function () {
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed') signalWaitingUpdate(reg);
      });
    });
  }

  function registerServiceWorker() {
    if (!isWebContext() || !('serviceWorker' in navigator)) return Promise.resolve(null);
    var url = new URL('service-worker.js', window.location.href);
    return navigator.serviceWorker
      .register(url.href, { scope: './' })
      .then(function (reg) {
        watchRegistration(reg);
        return reg;
      })
      .catch(function () {
        return null;
      });
  }

  function applyUpdate() {
    var waiting = registration && registration.waiting;
    if (!waiting) {
      setUpdateBannerVisible(false);
      return false;
    }
    reloadForUpdate = true;
    setUpdateBannerVisible(false);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  function dismissUpdate() {
    updateDismissed = true;
    setUpdateBannerVisible(false);
  }

  function syncNetworkStatus() {
    var offline = navigator.onLine === false;
    var badge = document.getElementById('pwa-offline-badge');
    if (badge) badge.classList.toggle('hidden', !offline);
    document.body.classList.toggle('pwa-offline', offline);
  }

  function prefetchDefaultTracks() {
    if (!isWebContext()) return;
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
          target.postMessage({ type: 'prefetch-default-tracks', tracks: tracks.slice() });
        }
      })
      .catch(function () {})
      .then(warmViaPageFetch);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    attachWebManifest();
    syncInstallButton();
    syncNetworkStatus();
    registerServiceWorker().then(function () {
      prefetchDefaultTracks();
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    if (!isWebContext() || isStandalone()) return;
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    syncInstallButton();
  });
  window.addEventListener('online', syncNetworkStatus);
  window.addEventListener('offline', syncNetworkStatus);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!reloadForUpdate) return;
      reloadForUpdate = false;
      window.location.reload();
    });
  }

  if (window.matchMedia) {
    var standaloneQuery = window.matchMedia('(display-mode: standalone)');
    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener('change', syncInstallButton);
    }
  }

  app.pwa = {
    init: init,
    install: install,
    applyUpdate: applyUpdate,
    dismissUpdate: dismissUpdate,
    showInstallHelp: showInstallHelp,
    hideInstallHelp: hideInstallHelp,
    isStandalone: isStandalone,
    getRegistration: function () {
      return registration;
    },
  };

  // Совместимые имена для существующих интеграций и тестов.
  app.attachWebManifest = attachWebManifest;
  app.registerServiceWorker = registerServiceWorker;
  app.prefetchDefaultTracks = prefetchDefaultTracks;
})(window.MafiaApp);
