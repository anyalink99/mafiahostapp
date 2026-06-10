/**
 * Автономный режим — ночь 0, знакомство (auto-night-intro-screen).
 * Стадии: pre (предкаунтдаун + старт музыки) → main (мафия знакомится) →
 * gap → [merlin-pass → merlin-action] → freesit (свободная рассадка) → день 1.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  var FREESIT_SEC = 30;
  var INTRO_GAP_SEC = 5;

  A.transitionToNightIntro = function () {
    var s = app.autoState;
    s.phase = 'night-intro';
    s.nightNum = 0;
    A.navAfter('auto-night-intro-screen');
  };

  function showIntroStage(name) {
    var names = ['pre', 'main', 'gap', 'merlin-pass', 'merlin-action', 'freesit'];
    for (var i = 0; i < names.length; i++) {
      var x = el('auto-intro-stage-' + names[i]);
      if (x) x.classList.toggle('hidden', names[i] !== name);
    }
  }

  function clearIntroTimers() {
    var e = app._autoEphemeral;
    if (e.introPreInterval) {
      clearInterval(e.introPreInterval);
      e.introPreInterval = null;
    }
    if (e.introMainInterval) {
      clearInterval(e.introMainInterval);
      e.introMainInterval = null;
    }
    if (e.introGapInterval) {
      clearInterval(e.introGapInterval);
      e.introGapInterval = null;
    }
    if (e.introFreesitInterval) {
      clearInterval(e.introFreesitInterval);
      e.introFreesitInterval = null;
    }
  }

  function startNightIntroMusic() {
    if (app._autoEphemeral.introMusicActive) return;
    var hasLocal = false,
      hasSpotify = false;
    if (app.musicGetSlotPlayablePool) {
      try {
        hasLocal = (app.musicGetSlotPlayablePool('2') || []).length > 0;
      } catch (_) {}
    }
    if (app.spotifyGetSlotPlaylist && app.spotifyIsAuthenticated) {
      try {
        var sp = app.spotifyGetSlotPlaylist('2');
        hasSpotify = !!(sp && sp.playlistId && app.spotifyIsAuthenticated());
      } catch (_) {}
    }
    if (!hasLocal && !hasSpotify) return;
    if (!app.musicStartSlot) return;
    if (app.musicSetSessionVolumeMul) app.musicSetSessionVolumeMul(null);
    // Знакомство: трек стартует в начале pre-стадии (INTRO_PRE_SEC с) с разгоном к
    // дропу, чтобы дроп пришёлся на старт самого знакомства. Разгон фиксирован под
    // длину предкаунтдауна (но обрезается длиной проигрыша, если дроп ближе).
    try {
      app.musicStartSlot('2', { intro: true, leadInSec: A.INTRO_PRE_SEC });
    } catch (_) {}
    app._autoEphemeral.introMusicActive = true;
  }

  function stopIntroMusic() {
    if (!app._autoEphemeral.introMusicActive) return;
    if (app.stopMusic) {
      try {
        app.stopMusic();
      } catch (_) {}
    }
    app._autoEphemeral.introMusicActive = false;
  }

  app.renderAutoNightIntro = function () {
    clearIntroTimers();
    showIntroStage('pre');
    var preEl = el('auto-intro-pre-countdown');
    if (preEl) preEl.textContent = String(A.INTRO_PRE_SEC);
    startNightIntroMusic();
    var preLeft = A.INTRO_PRE_SEC;
    app._autoEphemeral.introPreInterval = setInterval(function () {
      preLeft--;
      var p = el('auto-intro-pre-countdown');
      if (p) p.textContent = String(Math.max(0, preLeft));
      if (preLeft <= 0) {
        clearInterval(app._autoEphemeral.introPreInterval);
        app._autoEphemeral.introPreInterval = null;
        startIntroBriefing();
      }
    }, 1000);
  };

  function startIntroBriefing() {
    showIntroStage('main');
    var mainEl = el('auto-intro-main-countdown');
    if (mainEl) mainEl.textContent = String(A.INTRO_MAIN_SEC);
    A.playSfx('mafia-wakes-acquaintance.mp3');
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([60, 40, 60]);
      } catch (_) {}
    }
    app._autoEphemeral.introMainEnd = Date.now() + A.INTRO_MAIN_SEC * 1000;
    app._autoEphemeral.intro10Played = false;
    app._autoEphemeral.introMainInterval = setInterval(function () {
      var left = Math.max(0, Math.ceil((app._autoEphemeral.introMainEnd - Date.now()) / 1000));
      var m = el('auto-intro-main-countdown');
      if (m) m.textContent = String(left);
      if (left === 10 && !app._autoEphemeral.intro10Played) {
        app._autoEphemeral.intro10Played = true;
        A.playSfx('mafia-10-seconds-acquaintance.mp3');
      }
      if (left <= 0) {
        clearInterval(app._autoEphemeral.introMainInterval);
        app._autoEphemeral.introMainInterval = null;
        startIntroGap();
      }
    }, 250);
  }

  function startIntroGap() {
    showIntroStage('gap');
    A.playSfx('mafia-leaves-acquaintance.mp3');
    if (app.musicSetSessionVolumeMul) app.musicSetSessionVolumeMul(0.5);
    var endTs = Date.now() + INTRO_GAP_SEC * 1000;
    var c = el('auto-intro-gap-countdown');
    if (c) c.textContent = String(INTRO_GAP_SEC);
    app._autoEphemeral.introGapInterval = setInterval(function () {
      var left = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
      var cd = el('auto-intro-gap-countdown');
      if (cd) cd.textContent = String(left);
      if (left <= 0) {
        clearInterval(app._autoEphemeral.introGapInterval);
        app._autoEphemeral.introGapInterval = null;
        if (A.getVariant().introWakesMerlin) startMerlinReveal();
        else startFreeSeating();
      }
    }, 250);
  }

  function findSeatByRole(role) {
    var seats = app.autoState.seats;
    for (var i = 0; i < seats.length; i++) {
      if (seats[i].role === role) return seats[i];
    }
    return null;
  }

  function startMerlinReveal() {
    var merlin = findSeatByRole('merlin');
    if (!merlin) {
      startFreeSeating();
      return;
    }
    showIntroStage('merlin-pass');
    var num = el('auto-intro-merlin-pass-num');
    if (num) num.textContent = '№' + merlin.id;
  }

  app.handleMerlinPassStart = function () {
    A.pushHistory();
    showIntroStage('merlin-action');
    var revealEl = el('auto-intro-merlin-reveal');
    if (!revealEl) return;
    var seats = app.autoState.seats;
    var blacks = [];
    var sheriff = null;
    for (var i = 0; i < seats.length; i++) {
      if (seats[i].role === 'mafia' || seats[i].role === 'don') blacks.push(seats[i]);
      else if (seats[i].role === 'sheriff') sheriff = seats[i];
    }
    blacks.sort(function (a, b) {
      return a.id - b.id;
    });
    var html = '';
    html += '<div class="text-mafia-cream/85 text-sm">Чёрные:</div>';
    html += '<div class="flex justify-center gap-2 flex-wrap">';
    for (var bi = 0; bi < blacks.length; bi++) {
      html +=
        '<span class="font-display font-bold text-3xl sm:text-4xl text-mafia-blood tabular-nums px-3 py-1 rounded border border-mafia-blood/55 bg-mafia-blood/15">№' +
        blacks[bi].id +
        '</span>';
    }
    html += '</div>';
    if (sheriff) {
      html += '<div class="text-mafia-cream/85 text-sm mt-3">Шериф:</div>';
      html +=
        '<div class="flex justify-center"><span class="font-display font-bold text-3xl sm:text-4xl text-mafia-gold tabular-nums px-3 py-1 rounded border border-mafia-gold/55 bg-mafia-gold/10">№' +
        sheriff.id +
        '</span></div>';
    }
    revealEl.innerHTML = html;
  };

  app.handleMerlinActionDone = function () {
    A.pushHistory();
    startFreeSeating();
  };

  function startFreeSeating() {
    showIntroStage('freesit');
    A.playSfx('30-seconds-free-sit.mp3');
    var endTs = Date.now() + FREESIT_SEC * 1000;
    var c = el('auto-intro-freesit-countdown');
    if (c) c.textContent = String(FREESIT_SEC);
    app._autoEphemeral.introFreesitInterval = setInterval(function () {
      var left = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
      var cd = el('auto-intro-freesit-countdown');
      if (cd) cd.textContent = String(left);
      if (left <= 0) {
        clearInterval(app._autoEphemeral.introFreesitInterval);
        app._autoEphemeral.introFreesitInterval = null;
        finishFreeSeating();
      }
    }, 250);
  }

  function finishFreeSeating() {
    stopIntroMusic();
    var opener = A.dayOpenerSeatId(1);
    var seq = ['morning.mp3'];
    if (opener) seq.push(opener + '.mp3');
    A.playSfxSequence(seq);
    var s = app.autoState;
    s.dayNum = 1;
    A.transitionToDay(1);
  }

  app.handleIntroFinish = function () {
    A.pushHistory();
    if (app._autoEphemeral.introMainInterval) {
      clearInterval(app._autoEphemeral.introMainInterval);
      app._autoEphemeral.introMainInterval = null;
    }
    startIntroGap();
  };

  app.handleFreesitFinish = function () {
    A.pushHistory();
    if (app._autoEphemeral.introFreesitInterval) {
      clearInterval(app._autoEphemeral.introFreesitInterval);
      app._autoEphemeral.introFreesitInterval = null;
    }
    finishFreeSeating();
  };

  app.registerScreenRenderer('auto-night-intro-screen', function () {
    app.renderAutoNightIntro();
  });
})(window.MafiaApp);
