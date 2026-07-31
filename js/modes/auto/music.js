/**
 * Автономный режим — маршрутизация фоновой музыки по экранам.
 *
 * Фазы не запускают плеер напрямую:
 *   • раздача ролей и активные ночи используют слот 1 «Раздача карт»;
 *   • ночь 0 (знакомство + свободная посадка) использует специальный intro-режим слота 2;
 *   • дневные и остальные экраны останавливают автоматически запущенный фон.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var ROUTES_BY_SCREEN = {
    'auto-reveal-screen': { key: '1' },
    'auto-night-intro-screen': { key: '2', stage: 'main', intro: true },
    'auto-night-pass-screen': { key: '1' },
    'auto-night-action-screen': { key: '1' },
    'auto-night-result-screen': { key: '1' },
  };

  function hasPlayableSource(slot) {
    var hasLocal = false;
    var hasSpotify = false;
    if (app.musicGetSlotPlayablePool) {
      try {
        hasLocal = (app.musicGetSlotPlayablePool(slot) || []).length > 0;
      } catch (_) {}
    }
    if (app.spotifyGetSlotPlaylist && app.spotifyIsAuthenticated) {
      try {
        var playlist = app.spotifyGetSlotPlaylist(slot);
        hasSpotify = !!(playlist && playlist.playlistId && app.spotifyIsAuthenticated());
      } catch (_) {}
    }
    return hasLocal || hasSpotify;
  }

  function hasCurrentSession(slot) {
    if (!app.getCurrentMusicSlot || app.getCurrentMusicSlot() !== slot) return false;
    return !!(
      (app.hasActiveMusicSession && app.hasActiveMusicSession()) ||
      (app.isMusicPlaying && app.isMusicPlaying())
    );
  }

  A.startAutoMusicSlot = function (slot, opts) {
    var key = String(slot) === '2' ? '2' : '1';
    var e = app._autoEphemeral;
    var pending =
      e.autoMusicActive &&
      e.autoMusicSlot === key &&
      Date.now() - (e.autoMusicStartedAt || 0) < 5000;
    if (e.autoMusicActive && e.autoMusicSlot === key && (pending || hasCurrentSession(key))) {
      return true;
    }
    if (!hasPlayableSource(key) || !app.musicStartSlot) return false;

    if (app.musicSetSessionVolumeMul) app.musicSetSessionVolumeMul(null);
    try {
      app.musicStartSlot(key, opts || undefined);
    } catch (_) {
      return false;
    }
    e.autoMusicActive = true;
    e.autoMusicSlot = key;
    e.autoMusicStartedAt = Date.now();
    e.introMusicActive = key === '2';
    return true;
  };

  A.stopAutoMusic = function () {
    var e = app._autoEphemeral;
    if (app.audioDirector) app.audioDirector.forget('auto');
    if (!e.autoMusicActive && !e.introMusicActive) return false;
    if (app.stopMusic) {
      try {
        app.stopMusic();
      } catch (_) {}
    }
    e.autoMusicActive = false;
    e.autoMusicSlot = null;
    e.autoMusicStartedAt = 0;
    e.introMusicActive = false;
    return true;
  };

  A.setAutoIntroMusicStage = function (stage) {
    if (app.audioDirector) {
      app.audioDirector.setStage('auto', stage);
      return;
    }
    applyAutoIntroMusicStage(stage);
  };

  function applyAutoIntroMusicStage(stage) {
    if (!app.musicSetSessionVolumeMul) return;
    // Договорка играет с настроенной пользователем громкостью трека.
    // После неё фон намеренно тише во время перехода/Merlin/свободной посадки.
    app.musicSetSessionVolumeMul(stage === 'ambient' ? 0.5 : null);
  }

  if (app.audioDirector) {
    app.audioDirector.registerMode('auto', {
      routes: ROUTES_BY_SCREEN,
      play: function (cue) {
        A.startAutoMusicSlot(
          cue.key,
          cue.intro ? { intro: true, leadInSec: A.INTRO_PRE_SEC } : null
        );
      },
      stop: function () {
        A.stopAutoMusic();
      },
      setStage: function (stage) {
        applyAutoIntroMusicStage(stage);
      },
    });
  }

  A.syncAutoMusicForScreen = function (screenId) {
    var cue = ROUTES_BY_SCREEN[screenId];
    if (app.audioDirector) {
      app.audioDirector.enter('auto', screenId);
      return cue ? cue.key : null;
    }
    var slot = cue && cue.key;
    if (!slot) {
      A.stopAutoMusic();
      return null;
    }
    var opts = cue.intro
      ? {
          intro: true,
          leadInSec: A.INTRO_PRE_SEC,
        }
      : null;
    A.startAutoMusicSlot(slot, opts);
    return slot;
  };

  if (app.onNavigated) {
    app.onNavigated(function (screenId) {
      A.syncAutoMusicForScreen(screenId);
    });
  }
})(window.MafiaApp);
