(function (app) {
  var TICK_MS = 200;
  var TIMER_MAX_SEC = 999;
  app.TIMER_MAIN_SEC_KEY = 'mafia_host_timer_main_sec';
  app.TIMER_SHORT_SEC_KEY = 'mafia_host_timer_short_sec';

  function clampSec(n) {
    if (typeof n !== 'number' || isNaN(n)) return 0;
    n = Math.round(n);
    if (n < 0) return 0;
    if (n > TIMER_MAX_SEC) return TIMER_MAX_SEC;
    return n;
  }

  function timerCueHapticAndShake(seconds) {
    if (seconds !== 10 && seconds !== 0) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(seconds === 0 ? [90, 45, 90] : 55);
      } catch (_e) {}
    }
    var pill = document.getElementById('timer-pill');
    if (!pill) return;
    pill.classList.remove('timer-pill--shake');
    void pill.offsetWidth;
    pill.classList.add('timer-pill--shake');
    window.setTimeout(function () {
      pill.classList.remove('timer-pill--shake');
    }, 420);
  }

  app.syncTimerAppearance = function () {
    var pill = document.getElementById('timer-pill');
    var urgent = app.timeLeft <= 10;
    if (pill) {
      pill.classList.toggle('border-mafia-blood/55', urgent);
      pill.classList.toggle('bg-mafia-blood', urgent);
      pill.classList.toggle('border-mafia-border/35', !urgent);
      pill.classList.toggle('bg-black/25', !urgent);
    }
  };

  var TIMER_BTN_BASE =
    'px-3 py-2 sm:px-5 sm:py-3 font-semibold rounded uppercase text-xs sm:text-sm tracking-wider cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-[118ms] ease-out';
  function applyTimerButtonState(running) {
    var btn = document.getElementById('start-btn');
    if (!btn) return;
    btn.textContent = running ? 'Пауза' : 'Старт';
    btn.setAttribute('aria-pressed', running ? 'true' : 'false');
    btn.className =
      TIMER_BTN_BASE +
      (running
        ? ' bg-red-900 hover:bg-red-800 border border-red-700 text-white'
        : ' bg-green-800 hover:bg-green-700 border border-green-600 text-white');
  }

  function clearTimerInterval() {
    if (app.timerInterval) {
      clearInterval(app.timerInterval);
      app.timerInterval = null;
    }
  }

  // Сколько секунд осталось по «настенным» часам — устойчиво к фоновому троттлингу
  // setInterval (свернутая вкладка/приложение). Когда таймер на паузе — это app.timeLeft.
  function computeRemaining() {
    if (!app.timerRunning || app.timerEndsAt == null) return app.timeLeft;
    return Math.max(0, Math.round((app.timerEndsAt - Date.now()) / 1000));
  }

  function renderTimerValue() {
    var te = document.getElementById('timer');
    if (te) te.textContent = app.timeLeft;
  }

  function fireThresholdCues(prev, rem) {
    if (!app._timerCue10Fired && prev > 10 && rem <= 10 && rem > 0) {
      app._timerCue10Fired = true;
      timerCueHapticAndShake(10);
      if (app.timerVoiceEnabled) app.playTimerVoiceCue('10');
    }
    if (!app._timerCue0Fired && rem <= 0) {
      app._timerCue0Fired = true;
      timerCueHapticAndShake(0);
      if (app.timerVoiceEnabled) app.playTimerVoiceCue('0');
    }
  }

  function finishTimer() {
    clearTimerInterval();
    app.timerRunning = false;
    app.timerEndsAt = null;
    app.timeLeft = 0;
    renderTimerValue();
    app.syncTimerAppearance();
    applyTimerButtonState(false);
    app.saveState();
  }

  // Один тик: пересчитываем остаток от endsAt, рендерим только при смене секунды.
  app.tickTimer = function () {
    if (!app.timerRunning) return;
    var prev = app.timeLeft;
    var rem = computeRemaining();
    if (rem !== prev) {
      app.timeLeft = rem;
      renderTimerValue();
      app.syncTimerAppearance();
      fireThresholdCues(prev, rem);
      app.saveState();
    }
    if (rem <= 0) finishTimer();
  };

  app.toggleTimer = function () {
    if (app.timerRunning) {
      app.timeLeft = computeRemaining();
      app.timerRunning = false;
      app.timerEndsAt = null;
      clearTimerInterval();
      applyTimerButtonState(false);
      renderTimerValue();
      app.syncTimerAppearance();
      app.saveState();
    } else {
      if (app.timeLeft <= 0) return;
      app.timerRunning = true;
      app.timerEndsAt = Date.now() + app.timeLeft * 1000;
      app._timerCue10Fired = app.timeLeft <= 10;
      app._timerCue0Fired = false;
      applyTimerButtonState(true);
      clearTimerInterval();
      app.timerInterval = setInterval(app.tickTimer, TICK_MS);
      app.saveState();
    }
  };

  app.resetTimer = function (seconds) {
    clearTimerInterval();
    app.timerRunning = false;
    app.timerEndsAt = null;
    app.timeLeft = clampSec(seconds);
    app._timerCue10Fired = false;
    app._timerCue0Fired = false;
    renderTimerValue();
    app.syncTimerAppearance();
    applyTimerButtonState(false);
    app.saveState();
  };

  // Установить таймер в абсолютное значение (используется при перетаскивании).
  app.setTimer = function (seconds) {
    var next = clampSec(seconds);
    app.timeLeft = next;
    if (app.timerRunning) {
      app.timerEndsAt = Date.now() + next * 1000;
      app._timerCue10Fired = next <= 10;
      app._timerCue0Fired = false;
    }
    renderTimerValue();
    app.syncTimerAppearance();
    app.saveState();
  };

  // Подкрутка времени колесом (ПК) на «таблетке» таймера — относительно текущего.
  app.adjustTimer = function (deltaSeconds) {
    var base = app.timerRunning ? computeRemaining() : app.timeLeft;
    app.setTimer(base + deltaSeconds);
  };

  // Восстанавливает ход таймера после перезагрузки страницы посреди отсчёта.
  app.resumeTimerIfRunning = function () {
    if (!app.timerRunning || app.timerEndsAt == null) return;
    var rem = computeRemaining();
    if (rem > 0) {
      app.timeLeft = rem;
      app._timerCue10Fired = rem <= 10;
      app._timerCue0Fired = false;
      clearTimerInterval();
      app.timerInterval = setInterval(app.tickTimer, TICK_MS);
      applyTimerButtonState(true);
      renderTimerValue();
      app.syncTimerAppearance();
    } else {
      finishTimer();
    }
  };

  // Синхронизирует число/кнопку таймера с состоянием — при заходе на game-screen.
  app.syncTimerControls = function () {
    if (app.timerRunning) app.timeLeft = computeRemaining();
    renderTimerValue();
    app.syncTimerAppearance();
    applyTimerButtonState(!!app.timerRunning);
  };

  app.loadTimerDurationPrefs = function () {
    try {
      var main = parseInt(localStorage.getItem(app.TIMER_MAIN_SEC_KEY), 10);
      if (!isNaN(main) && main > 0) app.timerMainSec = clampSec(main);
      var short = parseInt(localStorage.getItem(app.TIMER_SHORT_SEC_KEY), 10);
      if (!isNaN(short) && short > 0) app.timerShortSec = clampSec(short);
    } catch (_e) {}
    if (typeof app.timerMainSec !== 'number' || isNaN(app.timerMainSec) || app.timerMainSec <= 0) {
      app.timerMainSec = 60;
    }
    if (typeof app.timerShortSec !== 'number' || isNaN(app.timerShortSec) || app.timerShortSec <= 0) {
      app.timerShortSec = 30;
    }
  };

  app.saveTimerDurationPrefs = function () {
    try {
      localStorage.setItem(app.TIMER_MAIN_SEC_KEY, String(app.timerMainSec));
      localStorage.setItem(app.TIMER_SHORT_SEC_KEY, String(app.timerShortSec));
    } catch (_e) {}
  };

  // Обновляет подписи и data-seconds у пресет-кнопок (game-screen) из настроек.
  app.syncTimerPresetButtons = function () {
    var main = document.getElementById('btn-timer-preset-main');
    var short = document.getElementById('btn-timer-preset-short');
    if (main) {
      main.setAttribute('data-seconds', String(app.timerMainSec));
      main.textContent = app.timerMainSec + ' с';
    }
    if (short) {
      short.setAttribute('data-seconds', String(app.timerShortSec));
      short.textContent = app.timerShortSec + ' с';
    }
  };

  // Заполняет числовые поля длительности на экране настроек.
  app.syncTimerDurationInputs = function () {
    var mainInp = document.getElementById('setting-timer-main');
    var shortInp = document.getElementById('setting-timer-short');
    if (mainInp && document.activeElement !== mainInp) mainInp.value = String(app.timerMainSec);
    if (shortInp && document.activeElement !== shortInp) shortInp.value = String(app.timerShortSec);
  };

  app.setTimerDuration = function (which, seconds) {
    var v = clampSec(seconds);
    if (v <= 0) return;
    if (which === 'short') app.timerShortSec = v;
    else app.timerMainSec = v;
    app.saveTimerDurationPrefs();
    app.syncTimerPresetButtons();
  };
})(window.MafiaApp);
