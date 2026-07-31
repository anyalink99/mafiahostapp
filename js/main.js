(function (app) {
  function init() {
    if (app.spotifyHandleCallback) app.spotifyHandleCallback();
    app.loadState();
    if (app.spotifyLoadClientId) app.spotifyLoadClientId();
    if (app.loadTimerVoicePref) app.loadTimerVoicePref();
    if (app.loadTimerDurationPrefs) app.loadTimerDurationPrefs();
    if (app.resumeTimerIfRunning) app.resumeTimerIfRunning();
    if (app.musicSeedDefaultBundledTracks) app.musicSeedDefaultBundledTracks();
    if (app.initMusic) app.initMusic();
    app.bindUiEvents();
    if (app.applyGameTypeFromQuery) app.applyGameTypeFromQuery();
    if (app.consumeGameHistoryRestore) app.consumeGameHistoryRestore();
    if (app.updateResetButtonVisibility) app.updateResetButtonVisibility();
    if (app.pwa) app.pwa.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.MafiaApp);
