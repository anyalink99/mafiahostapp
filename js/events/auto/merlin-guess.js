/**
 * Обработчики финальной фазы Мерлина: последний повешенный чёрный может угадать
 * Мерлина и забрать победу мафии. Сама логика — modes/auto/mode.js.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-merlin-guess-pick'] = function (el) {
    var tid = parseInt(el.getAttribute('data-target-id'), 10);
    if (isNaN(tid)) {
      tid = parseInt(el.getAttribute('data-seat-id'), 10);
    }
    if (!isNaN(tid) && app.handleMerlinGuessPick) app.handleMerlinGuessPick(tid);
  };

  app.uiActionHandlers['auto-merlin-guess-finish'] = function () {
    app.handleMerlinGuessFinish();
  };
  app.uiActionHandlers['auto-merlin-guess-skip'] = function () {
    app.handleMerlinGuessSkip();
  };
})(window.MafiaApp);
