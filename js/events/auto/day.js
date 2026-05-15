/**
 * Обработчики дневной фазы: дневной таймер и переходы к голосованию/пропуску.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-day-toggle-timer'] = function () { app.toggleAutoDayTimer(); };

  app.uiActionHandlers['auto-day-reset-timer'] = function (el) {
    var sec = parseInt(el.getAttribute('data-seconds'), 10);
    if (!isNaN(sec)) app.resetAutoDayTimer(sec);
  };

  app.uiActionHandlers['auto-day-go-vote'] = function () { app.startAutoVote(); };
  app.uiActionHandlers['auto-day-skip-vote'] = function () { app.skipAutoVote(); };
})(window.MafiaApp);
