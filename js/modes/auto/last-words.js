/**
 * Автономный режим — последние слова казнённых (auto-last-words-screen):
 * таймер на каждого, цикл по нескольким повешенным (после поднятия всех).
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  A.transitionToLastWords = function (hangedIds) {
    var s = app.autoState;
    A.setPhase('last-words');
    s.lastWords = { hangedIds: hangedIds.slice(), cursor: 0, timeLeft: A.LAST_WORDS_SEC };
    s.vote = null;
    if (s.day) s.day.nominees = [];
    A.navAfter('auto-last-words-screen');
  };

  app.renderAutoLastWords = function () {
    var s = app.autoState;
    if (!s.lastWords) return;
    var labelEl = el('auto-last-words-day-label');
    if (labelEl) labelEl.textContent = 'День ' + (s.day ? s.day.dayNum : s.dayNum || 1);
    var ix = s.lastWords.cursor || 0;
    var hid = s.lastWords.hangedIds[ix];
    var numEl = el('auto-last-words-num');
    var nickEl = el('auto-last-words-nick');
    var seat = A.seatById(hid);
    if (numEl) numEl.textContent = '№' + hid;
    if (nickEl) nickEl.textContent = seat && seat.nick && seat.nick.trim() ? seat.nick.trim() : '';
    if (app._autoEphemeral.lastWordsInterval) {
      if (app.clockApi) app.clockApi.stop('auto-last-words');
      else clearInterval(app._autoEphemeral.lastWordsInterval);
      app._autoEphemeral.lastWordsInterval = null;
    }
    if (typeof s.lastWords.timeLeft !== 'number') s.lastWords.timeLeft = A.LAST_WORDS_SEC;
    var cd = el('auto-last-words-countdown');
    if (cd) cd.textContent = String(s.lastWords.timeLeft);
    syncAutoLastWordsTimerAppearance();
    applyAutoLastWordsTimerButtonState(false);
  };

  function syncAutoLastWordsTimerAppearance() {
    var s = app.autoState;
    if (!s.lastWords) return;
    var pill = el('auto-last-words-timer-pill');
    var urgent = s.lastWords.timeLeft <= 10;
    if (pill) {
      pill.classList.toggle('border-mafia-blood/55', urgent);
      pill.classList.toggle('bg-mafia-blood', urgent);
      pill.classList.toggle('border-mafia-border/35', !urgent);
      pill.classList.toggle('bg-black/25', !urgent);
    }
  }

  function applyAutoLastWordsTimerButtonState(running) {
    var btn = el('auto-last-words-start-btn');
    if (!btn) return;
    btn.textContent = running ? 'Пауза' : 'Старт';
    btn.setAttribute('aria-pressed', running ? 'true' : 'false');
    var base =
      'px-3 py-2 sm:px-5 sm:py-3 font-semibold rounded uppercase text-xs sm:text-sm tracking-wider cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-[118ms] ease-out';
    btn.className =
      base +
      (running
        ? ' bg-red-900 hover:bg-red-800 border border-red-700 text-white'
        : ' bg-green-800 hover:bg-green-700 border border-green-600 text-white');
  }

  app.toggleAutoLastWordsTimer = function () {
    var s = app.autoState;
    if (!s.lastWords) return;
    if (app._autoEphemeral.lastWordsInterval) {
      if (app.clockApi) app.clockApi.stop('auto-last-words');
      else clearInterval(app._autoEphemeral.lastWordsInterval);
      app._autoEphemeral.lastWordsInterval = null;
      applyAutoLastWordsTimerButtonState(false);
      return;
    }
    applyAutoLastWordsTimerButtonState(true);
    function onTick(clockState) {
      if (!s.lastWords) {
        if (app.clockApi) app.clockApi.stop('auto-last-words');
        else clearInterval(app._autoEphemeral.lastWordsInterval);
        app._autoEphemeral.lastWordsInterval = null;
        return;
      }
      var nextTime = app.clockApi
        ? Math.max(0, Math.ceil(clockState.remainingMs / 1000))
        : Math.max(0, s.lastWords.timeLeft - 1);
      if (nextTime !== s.lastWords.timeLeft) {
        s.lastWords.timeLeft = nextTime;
        var cd = el('auto-last-words-countdown');
        if (cd) cd.textContent = String(s.lastWords.timeLeft);
        syncAutoLastWordsTimerAppearance();
        if (app.timerVoiceEnabled && s.lastWords.timeLeft === 10 && app.playTimerVoiceCue) {
          app.playTimerVoiceCue('10');
        }
        if (s.lastWords.timeLeft <= 0) {
          if (app.clockApi) app.clockApi.stop('auto-last-words');
          else clearInterval(app._autoEphemeral.lastWordsInterval);
          app._autoEphemeral.lastWordsInterval = null;
          applyAutoLastWordsTimerButtonState(false);
          if (app.timerVoiceEnabled && app.playTimerVoiceCue) {
            app.playTimerVoiceCue('0');
          }
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
              navigator.vibrate([90, 45, 90]);
            } catch (_) {}
          }
        }
        A.saveAuto();
      }
    }
    if (app.clockApi) {
      app.clockApi.startCountdown('auto-last-words', s.lastWords.timeLeft * 1000, {
        tickMs: 200,
        onTick: onTick,
      });
      app._autoEphemeral.lastWordsInterval = 'clock-api';
    } else {
      app._autoEphemeral.lastWordsInterval = setInterval(onTick, 1000);
    }
  };

  app.resetAutoLastWordsTimer = function (sec) {
    var s = app.autoState;
    if (!s.lastWords) return;
    if (app._autoEphemeral.lastWordsInterval) {
      if (app.clockApi) app.clockApi.stop('auto-last-words');
      else clearInterval(app._autoEphemeral.lastWordsInterval);
      app._autoEphemeral.lastWordsInterval = null;
    }
    s.lastWords.timeLeft = sec;
    var cd = el('auto-last-words-countdown');
    if (cd) cd.textContent = String(sec);
    syncAutoLastWordsTimerAppearance();
    applyAutoLastWordsTimerButtonState(false);
    A.saveAuto();
  };

  app.handleLastWordsFinish = function () {
    if (app._autoEphemeral.lastWordsInterval) {
      if (app.clockApi) app.clockApi.stop('auto-last-words');
      else clearInterval(app._autoEphemeral.lastWordsInterval);
      app._autoEphemeral.lastWordsInterval = null;
    }
    var s = app.autoState;
    if (!s.lastWords) return;
    A.pushHistory();
    s.lastWords.cursor = (s.lastWords.cursor || 0) + 1;
    if (s.lastWords.cursor < s.lastWords.hangedIds.length) {
      s.lastWords.timeLeft = A.LAST_WORDS_SEC;
      A.saveAuto();
      app.renderAutoLastWords();
      return;
    }
    s.lastWords = null;
    if (A.isPeacefulWin()) {
      A.endPeacefulOrMerlinGuess();
      return;
    }
    if (A.isMafiaWin()) {
      A.endGame('mafia');
      return;
    }
    A.transitionToNight((s.nightNum || 0) + 1);
  };

  app.registerScreenRenderer('auto-last-words-screen', function () {
    app.renderAutoLastWords();
  });
})(window.MafiaApp);
