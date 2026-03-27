(function (app) {
  app.syncTimerAppearance = function () {
    const el = document.getElementById('timer');
    if (!el) return;
    const urgent = app.timeLeft <= 10;
    el.classList.toggle('text-mafia-gold', !urgent);
    el.classList.toggle('text-mafia-blood', urgent);
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

  app.toggleTimer = function () {
    const btn = document.getElementById('start-btn');
    if (!btn) return;
    if (app.timerInterval) {
      clearInterval(app.timerInterval);
      app.timerInterval = null;
      applyTimerButtonState(false);
      app.syncTimerAppearance();
    } else {
      applyTimerButtonState(true);
      app.timerInterval = setInterval(function () {
        if (app.timeLeft > 0) {
          app.timeLeft--;
          const te = document.getElementById('timer');
          if (te) te.textContent = app.timeLeft;
          app.syncTimerAppearance();
          if (app.timerVoiceEnabled && app.timeLeft === 10) {
            app.playTimerVoiceCue('10');
          }
          if (app.timeLeft === 0 && app.timerVoiceEnabled) {
            app.playTimerVoiceCue('0');
          }
          app.saveState();
        } else {
          app.toggleTimer();
        }
      }, 1000);
    }
  };

  app.resetTimer = function (seconds) {
    if (app.timerInterval) clearInterval(app.timerInterval);
    app.timerInterval = null;
    app.timeLeft = seconds;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = app.timeLeft;
    app.syncTimerAppearance();
    applyTimerButtonState(false);
    app.saveState();
  };
})(window.MafiaApp);
